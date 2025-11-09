"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CreateManyAndReturnModelResolver = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const CreateManyAndReturnModelArgs_1 = require("./args/CreateManyAndReturnModelArgs");
const Model_1 = require("../../../models/Model");
const CreateManyAndReturnModel_1 = require("../../outputs/CreateManyAndReturnModel");
const helpers_1 = require("../../../helpers");
let CreateManyAndReturnModelResolver = class CreateManyAndReturnModelResolver {
    async createManyAndReturnModel(ctx, info, args) {
        const { _count } = (0, helpers_1.transformInfoIntoPrismaArgs)(info);
        return (0, helpers_1.getPrismaFromContext)(ctx).model.createManyAndReturn({
            ...args,
            ...(_count && (0, helpers_1.transformCountFieldIntoSelectRelationsCount)(_count)),
        });
    }
};
exports.CreateManyAndReturnModelResolver = CreateManyAndReturnModelResolver;
tslib_1.__decorate([
    TypeGraphQL.Mutation(_returns => [CreateManyAndReturnModel_1.CreateManyAndReturnModel], {
        nullable: false
    }),
    tslib_1.__param(0, TypeGraphQL.Ctx()),
    tslib_1.__param(1, TypeGraphQL.Info()),
    tslib_1.__param(2, TypeGraphQL.Args()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [Object, Object, CreateManyAndReturnModelArgs_1.CreateManyAndReturnModelArgs]),
    tslib_1.__metadata("design:returntype", Promise)
], CreateManyAndReturnModelResolver.prototype, "createManyAndReturnModel", null);
exports.CreateManyAndReturnModelResolver = CreateManyAndReturnModelResolver = tslib_1.__decorate([
    TypeGraphQL.Resolver(_of => Model_1.Model)
], CreateManyAndReturnModelResolver);
