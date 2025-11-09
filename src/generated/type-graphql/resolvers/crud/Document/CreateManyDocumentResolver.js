"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CreateManyDocumentResolver = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const CreateManyDocumentArgs_1 = require("./args/CreateManyDocumentArgs");
const Document_1 = require("../../../models/Document");
const AffectedRowsOutput_1 = require("../../outputs/AffectedRowsOutput");
const helpers_1 = require("../../../helpers");
let CreateManyDocumentResolver = class CreateManyDocumentResolver {
    async createManyDocument(ctx, info, args) {
        const { _count } = (0, helpers_1.transformInfoIntoPrismaArgs)(info);
        return (0, helpers_1.getPrismaFromContext)(ctx).document.createMany({
            ...args,
            ...(_count && (0, helpers_1.transformCountFieldIntoSelectRelationsCount)(_count)),
        });
    }
};
exports.CreateManyDocumentResolver = CreateManyDocumentResolver;
tslib_1.__decorate([
    TypeGraphQL.Mutation(_returns => AffectedRowsOutput_1.AffectedRowsOutput, {
        nullable: false
    }),
    tslib_1.__param(0, TypeGraphQL.Ctx()),
    tslib_1.__param(1, TypeGraphQL.Info()),
    tslib_1.__param(2, TypeGraphQL.Args()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [Object, Object, CreateManyDocumentArgs_1.CreateManyDocumentArgs]),
    tslib_1.__metadata("design:returntype", Promise)
], CreateManyDocumentResolver.prototype, "createManyDocument", null);
exports.CreateManyDocumentResolver = CreateManyDocumentResolver = tslib_1.__decorate([
    TypeGraphQL.Resolver(_of => Document_1.Document)
], CreateManyDocumentResolver);
