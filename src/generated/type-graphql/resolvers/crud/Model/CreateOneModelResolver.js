"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CreateOneModelResolver = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const CreateOneModelArgs_1 = require("./args/CreateOneModelArgs");
const Model_1 = require("../../../models/Model");
const helpers_1 = require("../../../helpers");
let CreateOneModelResolver = class CreateOneModelResolver {
    async createOneModel(ctx, info, args) {
        const { _count } = (0, helpers_1.transformInfoIntoPrismaArgs)(info);
        return (0, helpers_1.getPrismaFromContext)(ctx).model.create({
            ...args,
            ...(_count && (0, helpers_1.transformCountFieldIntoSelectRelationsCount)(_count)),
        });
    }
};
exports.CreateOneModelResolver = CreateOneModelResolver;
tslib_1.__decorate([
    TypeGraphQL.Mutation(_returns => Model_1.Model, {
        nullable: false
    }),
    tslib_1.__param(0, TypeGraphQL.Ctx()),
    tslib_1.__param(1, TypeGraphQL.Info()),
    tslib_1.__param(2, TypeGraphQL.Args()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [Object, Object, CreateOneModelArgs_1.CreateOneModelArgs]),
    tslib_1.__metadata("design:returntype", Promise)
], CreateOneModelResolver.prototype, "createOneModel", null);
exports.CreateOneModelResolver = CreateOneModelResolver = tslib_1.__decorate([
    TypeGraphQL.Resolver(_of => Model_1.Model)
], CreateOneModelResolver);
