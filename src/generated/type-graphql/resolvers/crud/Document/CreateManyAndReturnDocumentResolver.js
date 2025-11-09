"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CreateManyAndReturnDocumentResolver = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const CreateManyAndReturnDocumentArgs_1 = require("./args/CreateManyAndReturnDocumentArgs");
const Document_1 = require("../../../models/Document");
const CreateManyAndReturnDocument_1 = require("../../outputs/CreateManyAndReturnDocument");
const helpers_1 = require("../../../helpers");
let CreateManyAndReturnDocumentResolver = class CreateManyAndReturnDocumentResolver {
    async createManyAndReturnDocument(ctx, info, args) {
        const { _count } = (0, helpers_1.transformInfoIntoPrismaArgs)(info);
        return (0, helpers_1.getPrismaFromContext)(ctx).document.createManyAndReturn({
            ...args,
            ...(_count && (0, helpers_1.transformCountFieldIntoSelectRelationsCount)(_count)),
        });
    }
};
exports.CreateManyAndReturnDocumentResolver = CreateManyAndReturnDocumentResolver;
tslib_1.__decorate([
    TypeGraphQL.Mutation(_returns => [CreateManyAndReturnDocument_1.CreateManyAndReturnDocument], {
        nullable: false
    }),
    tslib_1.__param(0, TypeGraphQL.Ctx()),
    tslib_1.__param(1, TypeGraphQL.Info()),
    tslib_1.__param(2, TypeGraphQL.Args()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [Object, Object, CreateManyAndReturnDocumentArgs_1.CreateManyAndReturnDocumentArgs]),
    tslib_1.__metadata("design:returntype", Promise)
], CreateManyAndReturnDocumentResolver.prototype, "createManyAndReturnDocument", null);
exports.CreateManyAndReturnDocumentResolver = CreateManyAndReturnDocumentResolver = tslib_1.__decorate([
    TypeGraphQL.Resolver(_of => Document_1.Document)
], CreateManyAndReturnDocumentResolver);
